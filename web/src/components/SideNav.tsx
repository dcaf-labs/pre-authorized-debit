import { Flex, HStack, Text, VStack } from '@chakra-ui/react';
import ColorModeToggle from './ColorModeToggle';
import { IconCoins, IconCreditCard } from '@tabler/icons-react';
import Link from 'next/link';

const SideNav: React.FC = () => {
    return (
        <Flex
            direction="column"
            w="256px"
            h="100vh"
            bgColor="chakra-subtle-bg"
            justifyContent="flex-start"
            alignItems="start"
            p="20px"
        >
            <Flex direction="column" justifyContent="flex-start" alignItems="start" h="50%">
                <Text fontSize="xl" fontWeight="bold">
                    Pre-Authorized Debits
                </Text>
                <VStack mt="40px" spacing="20px" alignItems="start">
                    <Link href="/">
                        <HStack cursor="pointer" fontWeight="semibold">
                            <IconCoins />
                            <Text>Token Accounts</Text>
                        </HStack>
                    </Link>
                    <Link href="/pads">
                        <HStack cursor="pointer" fontWeight="semibold">
                            <IconCreditCard />
                            <Text>All Pre-Authorizations</Text>
                        </HStack>
                    </Link>
                </VStack>
            </Flex>
            <Flex direction="column" justifyContent="flex-end" alignItems="start" h="50%">
                <ColorModeToggle />
            </Flex>
        </Flex>
    );
};

export default SideNav;
